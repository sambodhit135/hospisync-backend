package hospital.Hospisync_backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hospital.Hospisync_backend.dto.RecommendationResponse;
import hospital.Hospisync_backend.dto.TransferStatusDTO;
import hospital.Hospisync_backend.model.BedCategory;
import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.repository.DoctorRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import hospital.Hospisync_backend.repository.TransferRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TransferService {

    private final TransferRepository transferRepository;
    private final HospitalRepository hospitalRepository;
    private final DoctorRepository doctorRepository;
    private final NotificationService notificationService;
    private final EmailService emailService;
    private final BedCategoryService bedCategoryService;
    private final HospitalService hospitalService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // =============================================
    // CREATE TRANSFER
    // =============================================

    @Transactional
    public Transfer createTransfer(Long fromId, Long toId, int patientCount,
                                   Map<String, Integer> bedAllocations, String priority) {
        return createTransfer(fromId, toId, patientCount, bedAllocations, priority, 1, "[]");
    }

    @Transactional
    public Transfer createTransfer(Long fromId, Long toId, int patientCount,
                                   Map<String, Integer> bedAllocations, String priority,
                                   int attemptNumber, String hospitalsTried) {
        if (fromId.equals(toId)) {
            throw new RuntimeException("Cannot transfer patients to the same hospital.");
        }

        if (attemptNumber == 1) {
            List<String> activeStages = List.of("PENDING", "ACKNOWLEDGED");
            boolean hasActiveTransfer = transferRepository.existsByFromHospitalIdAndStageIn(fromId, activeStages);
            if (hasActiveTransfer) {
                throw new RuntimeException(
                    "You already have an active transfer request in progress. Please wait for the response or cancel it before sending a new one."
                );
            }
        }

        Hospital from = hospitalRepository.findById(fromId)
                .orElseThrow(() -> new RuntimeException("Source hospital not found"));
        Hospital to = hospitalRepository.findById(toId)
                .orElseThrow(() -> new RuntimeException("Target hospital not found"));

        // Normalize bedAllocations
        Map<String, Integer> finalAllocations = bedAllocations != null ? bedAllocations : new HashMap<>();
        finalAllocations = finalAllocations.entrySet().stream()
                .filter(e -> e.getValue() != null && e.getValue() > 0)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        int totalFromBedTypes = finalAllocations.values().stream().mapToInt(Integer::intValue).sum();
        int finalPatientCount = totalFromBedTypes > 0 ? totalFromBedTypes : patientCount;

        // Capacity validation
        if (!finalAllocations.isEmpty()) {
            List<BedCategory> targetCategories = bedCategoryService.getCategories(toId);
            Map<String, BedCategory> categoryMap = targetCategories.stream()
                    .collect(Collectors.toMap(
                            c -> c.getCategoryName().toLowerCase().trim(),
                            c -> c,
                            (a, b) -> a
                    ));

            List<String> errors = new ArrayList<>();
            for (Map.Entry<String, Integer> entry : finalAllocations.entrySet()) {
                validateBedCapacity(categoryMap, entry.getKey().toLowerCase().trim(), entry.getValue(), errors);
            }

            if (!errors.isEmpty()) {
                throw new RuntimeException(String.join(" | ", errors));
            }
        }

        LocalDateTime now = LocalDateTime.now();
        Transfer transfer = Transfer.builder()
                .fromHospital(from)
                .toHospital(to)
                .patientCount(finalPatientCount)
                .bedAllocations(finalAllocations)
                .status("PENDING")
                .priority(priority != null ? priority.toUpperCase() : "NORMAL")
                .stage("PENDING")
                .acknowledgeBy(now.plusMinutes(2))
                .attemptNumber(attemptNumber)
                .hospitalsTried(hospitalsTried)
                .build();

        Transfer saved = transferRepository.save(transfer);

        String notifType = "EMERGENCY".equalsIgnoreCase(priority) ? "EMERGENCY" : "INFO";
        String notifPrefix = "EMERGENCY".equalsIgnoreCase(priority) ? "🚨 EMERGENCY: " : "";
        notificationService.createNotification(
                to,
                notifPrefix + "New patient transfer request from " + from.getHospitalName()
                        + " — " + finalPatientCount + " patients. Please acknowledge within 2 minutes.",
                notifType
        );
        emailService.sendTransferRequestCreatedEmail(to.getEmail(), to.getHospitalName(), from.getHospitalName(), finalPatientCount);

        log.info("Transfer created: from={}, to={}, patients={}, priority={}, id={}, attempt={}",
                fromId, toId, finalPatientCount, priority, saved.getId(), attemptNumber);

        return saved;
    }

    // =============================================
    // STAGE 1 — ACKNOWLEDGE
    // =============================================

    @Transactional
    public Transfer acknowledgeTransfer(Long transferId, Long hospitalId) {
        Transfer transfer = transferRepository.findById(transferId)
                .orElseThrow(() -> new RuntimeException("Transfer not found"));

        if (!transfer.getToHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Only the receiving hospital can acknowledge this transfer");
        }
        if (!"PENDING".equals(transfer.getStage())) {
            throw new RuntimeException("Transfer is not in PENDING stage (current stage: " + transfer.getStage() + ")");
        }

        LocalDateTime now = LocalDateTime.now();
        transfer.setStage("ACKNOWLEDGED");
        transfer.setAcknowledgedAt(now);
        transfer.setConfirmBy(now.plusMinutes(3));

        Transfer saved = transferRepository.save(transfer);

        notificationService.createNotification(
                transfer.getFromHospital(),
                "🔍 " + transfer.getToHospital().getHospitalName() + " is checking doctor availability for your transfer request.",
                "INFO"
        );

        log.info("Transfer {} acknowledged by hospital {}", transferId, hospitalId);
        return saved;
    }

    // =============================================
    // STAGE 2 — CONFIRM WITH DOCTOR
    // =============================================

    @Transactional
    public Transfer confirmTransferWithDoctor(Long transferId, Long doctorId, Long hospitalId) {
        Transfer transfer = transferRepository.findById(transferId)
                .orElseThrow(() -> new RuntimeException("Transfer not found"));

        if (!transfer.getToHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Only the receiving hospital can confirm this transfer");
        }
        if (!"ACKNOWLEDGED".equals(transfer.getStage())) {
            throw new RuntimeException("Transfer must be in ACKNOWLEDGED stage to confirm (current: " + transfer.getStage() + ")");
        }

        Doctor doctor = doctorRepository.findById(doctorId)
                .orElseThrow(() -> new RuntimeException("Doctor not found"));

        // Verify doctor belongs to this hospital
        if (!doctor.getHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Doctor does not belong to this hospital");
        }

        LocalDateTime now = LocalDateTime.now();
        transfer.setStage("APPROVED");
        transfer.setStatus("APPROVED");
        transfer.setAssignedDoctorId(doctorId);
        transfer.setConfirmedAt(now);
        transfer.setApprovedAt(now);

        // Update occupancy for bed allocations at destination hospital
        Map<String, Integer> allocations = transfer.getBedAllocations();
        if (allocations != null && !allocations.isEmpty()) {
            List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);
            for (Map.Entry<String, Integer> entry : allocations.entrySet()) {
                String targetName = entry.getKey().toLowerCase().trim();
                int count = entry.getValue();
                categories.stream()
                        .filter(c -> c.getCategoryName().toLowerCase().trim().equals(targetName)
                                || c.getCategoryName().toLowerCase().trim().contains(targetName))
                        .findFirst()
                        .ifPresent(cat -> {
                            cat.setOccupiedBeds(cat.getOccupiedBeds() + count);
                            log.info("Updated occupancy for {} at hospital {}: +{}", cat.getCategoryName(), hospitalId, count);
                        });
            }
        }

        Transfer saved = transferRepository.save(transfer);

        notificationService.createNotification(
                transfer.getFromHospital(),
                "✅ Transfer APPROVED — " + transfer.getToHospital().getHospitalName()
                        + " assigned Dr. " + doctor.getName() + " to your " + transfer.getPatientCount() + " patient transfer.",
                "SUCCESS"
        );
        emailService.sendTransferApprovedEmail(transfer.getFromHospital().getEmail(), transfer.getToHospital().getHospitalName());

        log.info("Transfer {} confirmed with doctor {} by hospital {}", transferId, doctorId, hospitalId);
        return saved;
    }

    // =============================================
    // REJECT + ESCALATE
    // =============================================

    @Transactional
    public Transfer rejectTransfer(Long transferId, Long hospitalId) {
        Transfer transfer = transferRepository.findById(transferId)
                .orElseThrow(() -> new RuntimeException("Transfer not found"));

        if (!transfer.getToHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Only the receiving hospital can reject this transfer");
        }
        if (!List.of("PENDING", "ACKNOWLEDGED").contains(transfer.getStage())) {
            throw new RuntimeException("Transfer cannot be rejected in its current stage: " + transfer.getStage());
        }

        transfer.setStage("REJECTED");
        transfer.setStatus("REJECTED");
        transferRepository.save(transfer);

        notificationService.createNotification(
                transfer.getFromHospital(),
                "❌ " + transfer.getToHospital().getHospitalName() + " rejected the transfer. Looking for next available hospital...",
                "WARNING"
        );
        emailService.sendTransferRejectedEmail(transfer.getFromHospital().getEmail(), transfer.getToHospital().getHospitalName());

        escalateToNextHospital(transfer);
        log.info("Transfer {} rejected by hospital {}", transferId, hospitalId);
        return transfer;
    }

    // =============================================
    // ESCALATION LOGIC
    // =============================================

    @Transactional
    public void escalateToNextHospital(Transfer original) {
        Long fromId = original.getFromHospital().getId();
        Map<String, Integer> bedAllocations = original.getBedAllocations();

        // Parse hospitals already tried
        List<Long> triedIds;
        try {
            triedIds = new ArrayList<>(objectMapper.readValue(original.getHospitalsTried(),
                    new TypeReference<List<Long>>() {}));
        } catch (JsonProcessingException e) {
            log.warn("Could not parse hospitalsTried JSON, starting fresh: {}", e.getMessage());
            triedIds = new ArrayList<>();
        }

        // Add the current toHospital to the tried list
        triedIds.add(original.getToHospital().getId());

        String updatedTriedJson;
        try {
            updatedTriedJson = objectMapper.writeValueAsString(triedIds);
        } catch (JsonProcessingException e) {
            updatedTriedJson = "[]";
        }

        // Find next candidate hospital (within 25km, excluding tried IDs)
        final List<Long> finalTriedIds = triedIds;
        List<Hospital> candidates = hospitalRepository.findAllExcept(fromId).stream()
                .filter(h -> !finalTriedIds.contains(h.getId()))
                .collect(Collectors.toList());

        // Score candidates by available beds matching the request
        Optional<Hospital> nextHospital = candidates.stream()
                .filter(h -> hasEnoughBeds(h.getId(), bedAllocations))
                .findFirst();

        if (nextHospital.isPresent()) {
            Hospital next = nextHospital.get();
            log.info("Escalating transfer from hospital {} to next candidate hospital {} (attempt {})",
                    fromId, next.getId(), original.getAttemptNumber() + 1);

            createTransfer(
                    fromId,
                    next.getId(),
                    original.getPatientCount(),
                    bedAllocations,
                    original.getPriority(),
                    original.getAttemptNumber() + 1,
                    updatedTriedJson
            );
        } else {
            // No more hospitals available
            log.warn("No available hospital found for escalation from hospital {}. Transfer chain exhausted.", fromId);
            notificationService.createNotification(
                    original.getFromHospital(),
                    "⚠️ No available hospital found for your patient transfer request. Please contact network operations.",
                    "WARNING"
            );
        }
    }

    private boolean hasEnoughBeds(Long hospitalId, Map<String, Integer> requirements) {
        if (requirements == null || requirements.isEmpty()) return true;
        try {
            List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);
            Map<String, BedCategory> categoryMap = categories.stream()
                    .collect(Collectors.toMap(
                            c -> c.getCategoryName().toLowerCase().trim(),
                            c -> c,
                            (a, b) -> a
                    ));

            for (Map.Entry<String, Integer> req : requirements.entrySet()) {
                String key = req.getKey().toLowerCase().trim();
                BedCategory cat = categoryMap.get(key);
                if (cat == null) return false;
                if (cat.getAvailableBeds() < req.getValue()) return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("Could not validate beds for hospital {}: {}", hospitalId, e.getMessage());
            return false;
        }
    }

    // =============================================
    // QUERIES
    // =============================================

    @Transactional(readOnly = true)
    public List<Transfer> getActiveIncomingTransfers(Long hospitalId) {
        return transferRepository.findByToHospitalIdAndStageIn(hospitalId,
                List.of("PENDING", "ACKNOWLEDGED"));
    }

    @Transactional(readOnly = true)
    public TransferStatusDTO getTransferStatus(Long transferId, Long fromHospitalId,
                                                RecommendationService recommendationService) {
        Transfer t = transferRepository.findById(transferId)
                .orElseThrow(() -> new RuntimeException("Transfer not found"));

        if (!t.getFromHospital().getId().equals(fromHospitalId)) {
            throw new RuntimeException("You are not the sender of this transfer");
        }

        TransferStatusDTO.TransferStatusDTOBuilder builder = TransferStatusDTO.builder()
                .transferId(t.getId())
                .stage(t.getStage())
                .status(t.getStatus())
                .toHospitalId(t.getToHospital().getId())
                .toHospitalName(t.getToHospital().getHospitalName())
                .totalPatients(t.getPatientCount())
                .priority(t.getPriority())
                .acknowledgeBy(t.getAcknowledgeBy())
                .confirmBy(t.getConfirmBy())
                .createdAt(t.getCreatedAt());

        // On terminal stages, fetch next recommendation
        List<String> terminalStages = List.of("TIMEOUT_STAGE1", "TIMEOUT_STAGE2", "REJECTED");
        if (terminalStages.contains(t.getStage())) {
            try {
                // Parse tried hospital IDs from JSON string "[1,2,3]"
                List<Long> triedIds = new ArrayList<>();
                String tried = t.getHospitalsTried();
                if (tried != null && !tried.equals("[]")) {
                    tried = tried.replaceAll("[\\[\\]\\s]", "");
                    for (String part : tried.split(",")) {
                        if (!part.isEmpty()) triedIds.add(Long.parseLong(part));
                    }
                }

                List<RecommendationResponse> nextRecs = recommendationService
                        .getRecommendationsExcluding(fromHospitalId, null, null, triedIds);

                if (!nextRecs.isEmpty()) {
                    RecommendationResponse next = nextRecs.get(0);
                    TransferStatusDTO.NextHospitalDTO nextHosp = TransferStatusDTO.NextHospitalDTO.builder()
                            .hospitalId(next.getId())
                            .hospitalName(next.getHospitalName())
                            .distanceKm(next.getDistance())
                            .availableBeds(next.getAvailableBeds())
                            .score(next.getScore())
                            .availableDoctorName(next.getAvailableDoctorName())
                            .availableDoctorSpeciality(next.getAvailableDoctorSpeciality())
                            .build();
                    builder.nextHospital(nextHosp);
                }
            } catch (Exception e) {
                log.warn("Could not fetch next recommendation for transfer {}: {}", transferId, e.getMessage());
            }
        }

        return builder.build();
    }

    @Transactional(readOnly = true)
    public List<Transfer> getTransfersByHospital(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        return transferRepository.findByFromHospitalOrToHospitalOrderByCreatedAtDesc(hospital, hospital);
    }

    @Transactional(readOnly = true)
    public List<Transfer> getOutgoingTransfers(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        log.info("Fetching outgoing transfers for hospital_id = {}", hospitalId);
        return transferRepository.findByFromHospitalOrderByCreatedAtDesc(hospital);
    }

    @Transactional(readOnly = true)
    public List<Transfer> getIncomingTransfers(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        log.info("Fetching incoming transfers for hospital_id = {}", hospitalId);
        return transferRepository.findByToHospitalOrderByCreatedAtDesc(hospital);
    }

    @Transactional
    public Transfer updateTransferStatus(Long transferId, Long hospitalId, String status) {
        Transfer transfer = transferRepository.findById(transferId)
                .orElseThrow(() -> new RuntimeException("Transfer not found"));

        if (!transfer.getToHospital().getId().equals(hospitalId)) {
            throw new RuntimeException("Only the receiving hospital can update this transfer status");
        }

        switch (status.toUpperCase()) {
            case "APPROVED":
                if (!List.of("PENDING", "ACKNOWLEDGED").contains(transfer.getStage())) {
                    throw new RuntimeException("Transfer cannot be approved in its current stage: " + transfer.getStage());
                }
                transfer.setStatus("APPROVED");
                transfer.setStage("APPROVED");
                transfer.setApprovedAt(LocalDateTime.now());

                Map<String, Integer> allocations = transfer.getBedAllocations();
                if (allocations != null && !allocations.isEmpty()) {
                    List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);
                    for (Map.Entry<String, Integer> entry : allocations.entrySet()) {
                        String targetName = entry.getKey().toLowerCase().trim();
                        int requestedCount = entry.getValue();
                        categories.stream()
                                .filter(c -> c.getCategoryName().toLowerCase().trim().equals(targetName)
                                        || c.getCategoryName().toLowerCase().trim().contains(targetName))
                                .findFirst()
                                .ifPresent(cat -> {
                                    cat.setOccupiedBeds(cat.getOccupiedBeds() + requestedCount);
                                });
                    }
                }

                notificationService.createNotification(
                        transfer.getFromHospital(),
                        transfer.getToHospital().getHospitalName() + " has accepted the patient transfer.",
                        "SUCCESS"
                );
                emailService.sendTransferApprovedEmail(transfer.getFromHospital().getEmail(), transfer.getToHospital().getHospitalName());
                break;

            case "REJECTED":
                transfer.setStatus("REJECTED");
                transfer.setStage("REJECTED");
                notificationService.createNotification(
                        transfer.getFromHospital(),
                        "Your transfer request to " + transfer.getToHospital().getHospitalName() + " has been rejected.",
                        "WARNING"
                );
                emailService.sendTransferRejectedEmail(transfer.getFromHospital().getEmail(), transfer.getToHospital().getHospitalName());
                break;

            case "COMPLETED":
                if (!"APPROVED".equals(transfer.getStatus())) {
                    throw new RuntimeException("Only APPROVED transfers can be marked as completed");
                }
                transfer.setStatus("COMPLETED");
                transfer.setStage("COMPLETED");
                transfer.setCompletedAt(LocalDateTime.now());
                break;

            default:
                throw new IllegalArgumentException("Invalid status: " + status);
        }

        return transferRepository.save(transfer);
    }

    // =============================================
    // HELPERS
    // =============================================

    private void validateBedCapacity(Map<String, BedCategory> categoryMap, String categoryName, int requested, List<String> errors) {
        if (requested <= 0) return;
        BedCategory matched = categoryMap.get(categoryName);
        if (matched == null) {
            for (Map.Entry<String, BedCategory> entry : categoryMap.entrySet()) {
                if (entry.getKey().contains(categoryName) || categoryName.contains(entry.getKey())) {
                    matched = entry.getValue();
                    break;
                }
            }
        }
        if (matched == null) {
            errors.add("Bed category '" + categoryName + "' not found at destination.");
            return;
        }
        int available = matched.getAvailableBeds();
        if (requested > available) {
            errors.add("Not enough " + matched.getCategoryName() + " available (requested: " + requested + ", available: " + available + ")");
        }
    }
}
