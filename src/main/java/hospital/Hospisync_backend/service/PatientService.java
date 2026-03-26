package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.PatientRequestDto;
import hospital.Hospisync_backend.dto.PatientStatusResponse;
import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.PatientRequest;
import hospital.Hospisync_backend.repository.DoctorRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import hospital.Hospisync_backend.repository.PatientRequestRepository;
import hospital.Hospisync_backend.service.PatientRecommendService.PatientHospitalResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PatientService {

    @Autowired
    private PatientRequestRepository repo;

    @Autowired
    private PatientRecommendService recommendService;

    @Autowired
    private DoctorRepository doctorRepo;

    @Autowired
    private HospitalRepository hospitalRepo;

    // ─── Create ──────────────────────────────────────────────────────────────

    public PatientStatusResponse createRequest(PatientRequestDto dto) {
        // Find doctor if ID is provided
        Doctor assignedDoctor = null;
        if (dto.getDoctorId() != null) {
            assignedDoctor = doctorRepo.findById(dto.getDoctorId()).orElse(null);
        }

        // Validation for preferredTime against doctor shift
        if (assignedDoctor != null && dto.getPreferredTime() != null) {
            String shiftStart = assignedDoctor.getShiftStart();
            String shiftEnd = assignedDoctor.getShiftEnd();
            if (shiftStart != null && shiftEnd != null) {
                // Basic string comparison works for "HH:mm" 24h format
                if (dto.getPreferredTime().compareTo(shiftStart) < 0 || dto.getPreferredTime().compareTo(shiftEnd) > 0) {
                    throw new RuntimeException("Selected arrival time " + dto.getPreferredTime() + 
                        " is outside the doctor's shift range (" + shiftStart + " - " + shiftEnd + "). Please select a valid time.");
                }
            }
        }

        PatientRequest req = PatientRequest.builder()
                .patientName(dto.getPatientName())
                .patientPhone(dto.getPatientPhone())
                .patientAge(dto.getPatientAge())
                .conditionDescription(dto.getConditionDescription())
                .specialityNeeded(dto.getSpecialityNeeded())
                .urgencyLevel(dto.getUrgencyLevel())
                .latitude(dto.getLatitude())
                .longitude(dto.getLongitude())
                .hospitalId(dto.getHospitalId())
                .hospitalName(dto.getHospitalName())
                .preferredArrivalTime(dto.getPreferredTime())
                .assignedDoctorId(assignedDoctor != null ? assignedDoctor.getId() : null)
                .assignedDoctorName(assignedDoctor != null ? assignedDoctor.getName() : null)
                .assignedDoctorSpeciality(assignedDoctor != null ? assignedDoctor.getSpeciality() : null)
                .status("PENDING")
                .attemptNumber(1)
                .hospitalsTried("[" + dto.getHospitalId() + "]")
                .build();

        PatientRequest saved = repo.save(req);
        return buildStatusResponse(saved, null);
    }

    // ─── Get Status ───────────────────────────────────────────────────────────

    public PatientStatusResponse getStatus(Long requestId) {
        PatientRequest req = repo.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found: " + requestId));

        PatientStatusResponse.NextHospitalDto nextHospital = null;

        if ("TIMEOUT".equals(req.getStatus()) || "REJECTED".equals(req.getStatus())) {
            List<Long> tried = parseTriedIds(req.getHospitalsTried());
            if (req.getLatitude() != null && req.getLongitude() != null) {
                List<PatientHospitalResult> candidates = recommendService.findHospitalsForPatient(
                        req.getLatitude(), req.getLongitude(), req.getSpecialityNeeded(), tried, null);

                if (!candidates.isEmpty()) {
                    PatientHospitalResult next = candidates.get(0);
                    nextHospital = PatientStatusResponse.NextHospitalDto.builder()
                            .hospitalId(next.getHospitalId())
                            .hospitalName(next.getHospitalName())
                            .distanceKm(next.getDistanceKm())
                            .availableBeds(next.getAvailableBeds())
                            .availableDoctorName(next.getAvailableDoctorName())
                            .availableDoctorSpeciality(next.getAvailableDoctorSpeciality())
                            .build();
                }
            }
        }

        return buildStatusResponse(req, nextHospital);
    }

    // ─── Confirm ──────────────────────────────────────────────────────────────

    public PatientStatusResponse confirmRequest(Long requestId, Long doctorId, String hospitalEmail) {
        PatientRequest req = findAndVerify(requestId, hospitalEmail);

        Doctor doctor = doctorRepo.findById(doctorId)
                .orElseThrow(() -> new RuntimeException("Doctor not found: " + doctorId));

        req.setStatus("CONFIRMED");
        req.setAssignedDoctorId(doctorId);
        req.setAssignedDoctorName(doctor.getName());
        req.setAssignedDoctorSpeciality(doctor.getSpeciality());

        // Increment doctor's patient count
        doctor.setCurrentPatientCount(doctor.getCurrentPatientCount() + 1);
        doctorRepo.save(doctor);

        PatientRequest saved = repo.save(req);
        log.info("Patient request {} confirmed by hospital email {} with doctor {}",
                requestId, hospitalEmail, doctor.getName());
        return buildStatusResponse(saved, null);
    }

    // ─── Reject ───────────────────────────────────────────────────────────────

    public PatientStatusResponse rejectRequest(Long requestId, String hospitalEmail) {
        PatientRequest req = findAndVerify(requestId, hospitalEmail);
        req.setStatus("REJECTED");
        PatientRequest saved = repo.save(req);
        log.info("Patient request {} rejected by hospital {}", requestId, hospitalEmail);
        return buildStatusResponse(saved, null);
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    public void cancelRequest(Long requestId) {
        PatientRequest req = repo.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found: " + requestId));
        req.setStatus("CANCELLED");
        repo.save(req);
        log.info("Patient request {} cancelled", requestId);
    }

    // ─── Incoming Requests for Hospital ──────────────────────────────────────

    public List<PatientStatusResponse> getIncomingRequests(String hospitalEmail) {
        Hospital hospital = hospitalRepo.findByEmail(hospitalEmail)
                .orElseThrow(() -> new RuntimeException("Hospital not found for email: " + hospitalEmail));
        List<PatientRequest> requests = repo.findByHospitalIdAndStatusIn(hospital.getId(), 
                List.of("PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "TIMEOUT", "NO_HOSPITAL_AVAILABLE"));
        
        return requests.stream()
                .map(req -> {
                    PatientStatusResponse resp = buildStatusResponse(req, null);
                    // Explicitly ensuring setPatientPhone exists/is called as requested
                    resp.setPatientPhone(req.getPatientPhone());
                    return resp;
                })
                .collect(Collectors.toList());
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private PatientRequest findAndVerify(Long requestId, String hospitalEmail) {
        PatientRequest req = repo.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found: " + requestId));
        Hospital hospital = hospitalRepo.findByEmail(hospitalEmail)
                .orElseThrow(() -> new RuntimeException("Hospital not found for email: " + hospitalEmail));
        if (!req.getHospitalId().equals(hospital.getId())) {
            throw new RuntimeException("Unauthorized: this request belongs to a different hospital");
        }
        return req;
    }

    private PatientStatusResponse buildStatusResponse(PatientRequest req,
            PatientStatusResponse.NextHospitalDto nextHospital) {
        
        String hospitalAddress = null;
        if ("CONFIRMED".equals(req.getStatus()) && req.getHospitalId() != null) {
            Optional<Hospital> h = hospitalRepo.findById(req.getHospitalId());
            hospitalAddress = h.map(Hospital::getAddress).orElse(null);
        }

        return PatientStatusResponse.builder()
                .requestId(req.getId())
                .status(req.getStatus())
                .patientName(req.getPatientName())
                .patientPhone(req.getPatientPhone())
                .hospitalName(req.getHospitalName())
                .urgencyLevel(req.getUrgencyLevel())
                .expiresAt(req.getExpiresAt())
                .assignedDoctorName(req.getAssignedDoctorName())
                .assignedDoctorSpeciality(req.getAssignedDoctorSpeciality())
                .hospitalAddress(hospitalAddress)
                .nextHospital(nextHospital)
                .build();
    }

    private List<Long> parseTriedIds(String hospitalsTried) {
        if (hospitalsTried == null || hospitalsTried.isBlank()) return List.of();
        try {
            String cleaned = hospitalsTried.replaceAll("[\\[\\]\\s]", "");
            if (cleaned.isEmpty()) return List.of();
            return Arrays.stream(cleaned.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Failed to parse hospitalsTried: {}", hospitalsTried);
            return List.of();
        }
    }
}
