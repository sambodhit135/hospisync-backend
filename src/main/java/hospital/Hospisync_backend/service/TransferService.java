package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.model.BedCategory;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.repository.HospitalRepository;
import hospital.Hospisync_backend.repository.TransferRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TransferService {

    private final TransferRepository transferRepository;
    private final HospitalRepository hospitalRepository;
    private final NotificationService notificationService;
    private final EmailService emailService;
    private final BedCategoryService bedCategoryService;

    @Transactional
    public Transfer createTransfer(Long fromId, Long toId, int patientCount,
                                   Map<String, Integer> bedAllocations, String priority) {
        if (fromId.equals(toId)) {
            throw new RuntimeException("Cannot transfer patients to the same hospital.");
        }

        Hospital from = hospitalRepository.findById(fromId)
                .orElseThrow(() -> new RuntimeException("Source hospital not found"));
        Hospital to = hospitalRepository.findById(toId)
                .orElseThrow(() -> new RuntimeException("Target hospital not found"));

        // Normalize bedAllocations
        Map<String, Integer> finalAllocations = bedAllocations != null ? bedAllocations : new java.util.HashMap<>();
        
        // Filter out zero/null allocations
        finalAllocations = finalAllocations.entrySet().stream()
                .filter(e -> e.getValue() != null && e.getValue() > 0)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        // Auto-calculate total from bed types
        int totalFromBedTypes = finalAllocations.values().stream().mapToInt(Integer::intValue).sum();
        int finalPatientCount = totalFromBedTypes > 0 ? totalFromBedTypes : patientCount;

        // ===== Capacity Validation =====
        if (!finalAllocations.isEmpty()) {
            List<BedCategory> targetCategories = bedCategoryService.getCategories(toId);
            Map<String, BedCategory> categoryMap = targetCategories.stream()
                    .collect(Collectors.toMap(
                            c -> c.getCategoryName().toLowerCase().trim(),
                            c -> c,
                            (a, b) -> a
                    ));

            List<String> errors = new java.util.ArrayList<>();
            for (Map.Entry<String, Integer> entry : finalAllocations.entrySet()) {
                validateBedCapacity(categoryMap, entry.getKey().toLowerCase().trim(), entry.getValue(), errors);
            }

            if (!errors.isEmpty()) {
                throw new RuntimeException(String.join(" | ", errors));
            }
        }

        Transfer transfer = Transfer.builder()
                .fromHospital(from)
                .toHospital(to)
                .patientCount(finalPatientCount)
                .bedAllocations(finalAllocations)
                .status("PENDING")
                .priority(priority != null ? priority.toUpperCase() : "NORMAL")
                .build();
        
        Transfer saved = transferRepository.save(transfer);

        // Notify destination hospital
        String notifType = "EMERGENCY".equalsIgnoreCase(priority) ? "EMERGENCY" : "INFO";
        String notifPrefix = "EMERGENCY".equalsIgnoreCase(priority) ? "🚨 EMERGENCY: " : "";
        notificationService.createNotification(
                to, 
                notifPrefix + "New patient transfer request from " + from.getHospitalName() + " for " + finalPatientCount + " patients.", 
                notifType
        );
        emailService.sendTransferRequestCreatedEmail(to.getEmail(), to.getHospitalName(), from.getHospitalName(), finalPatientCount);

        log.info("Transfer created: from_hospital_id={}, to_hospital_id={}, patients={}, priority={}, transfer_id={}", 
                 fromId, toId, finalPatientCount, priority, saved.getId());

        return saved;
    }

    private void validateBedCapacity(Map<String, BedCategory> categoryMap, String categoryName, int requested, List<String> errors) {
        if (requested <= 0) return;
        
        // Find a matching category — exact or contains
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
            // If category doesn't exist, we can't validate it, but we also can't easily fulfill it.
            // For now, let's just log it and allow it if it's a "custom" request, or block it?
            // User requested: "Recommendation filters should only display categories that exist in the hospital bed configuration."
            // So if it's being requested, it should exist.
            errors.add("Bed category '" + categoryName + "' not found at destination.");
            return;
        }
        
        int available = matched.getAvailableBeds();
        if (requested > available) {
            errors.add("Not enough " + matched.getCategoryName() + " available (requested: " + requested + ", available: " + available + ")");
        }
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
                if (!"PENDING".equals(transfer.getStatus())) {
                    throw new RuntimeException("Only PENDING transfers can be approved");
                }
                transfer.setStatus("APPROVED");
                transfer.setApprovedAt(LocalDateTime.now());
                
                // Update Destination Bed Occupancy
                if (status.equalsIgnoreCase("APPROVED")) {
                    Map<String, Integer> allocations = transfer.getBedAllocations();
                    if (allocations != null && !allocations.isEmpty()) {
                        List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);
                        for (Map.Entry<String, Integer> entry : allocations.entrySet()) {
                            String targetName = entry.getKey().toLowerCase().trim();
                            int requestedCount = entry.getValue();
                            
                            categories.stream()
                                .filter(c -> c.getCategoryName().toLowerCase().trim().equals(targetName) || 
                                            c.getCategoryName().toLowerCase().trim().contains(targetName))
                                .findFirst()
                                .ifPresent(cat -> {
                                    cat.setOccupiedBeds(cat.getOccupiedBeds() + requestedCount);
                                    log.info("Updated occupancy for {} at hospital {}: +{}", cat.getCategoryName(), hospitalId, requestedCount);
                                });
                        }
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
                if (!"PENDING".equals(transfer.getStatus())) {
                    throw new RuntimeException("Only PENDING transfers can be rejected");
                }
                transfer.setStatus("REJECTED");
                
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
                transfer.setCompletedAt(LocalDateTime.now());
                break;

            default:
                throw new IllegalArgumentException("Invalid status: " + status);
        }

        return transferRepository.save(transfer);
    }
}
