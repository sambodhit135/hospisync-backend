package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.PatientRequestDto;
import hospital.Hospisync_backend.dto.PatientStatusResponse;
import hospital.Hospisync_backend.model.PatientRequest;
import hospital.Hospisync_backend.service.PatientRecommendService;
import hospital.Hospisync_backend.service.PatientRecommendService.PatientHospitalResult;
import hospital.Hospisync_backend.service.PatientService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/patient")
@CrossOrigin(origins = "*")
@Slf4j
public class PatientController {

    @Autowired
    private PatientService patientService;

    @Autowired
    private PatientRecommendService recommendService;

    // ─── PUBLIC: Create Patient Request ──────────────────────────────────────

    @PostMapping("/request")
    public ResponseEntity<?> createRequest(@RequestBody PatientRequestDto dto) {
        try {
            PatientStatusResponse response = patientService.createRequest(dto);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Failed to create patient request: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── PUBLIC: Get Status ───────────────────────────────────────────────────

    @GetMapping("/request/{id}/status")
    public ResponseEntity<?> getStatus(@PathVariable Long id) {
        try {
            PatientStatusResponse response = patientService.getStatus(id);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to get status for request {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── PUBLIC: Cancel Request ───────────────────────────────────────────────

    @DeleteMapping("/request/{id}")
    public ResponseEntity<?> cancelRequest(@PathVariable Long id) {
        try {
            patientService.cancelRequest(id);
            return ResponseEntity.ok(Map.of("message", "Request cancelled"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── PUBLIC: Find Hospitals ───────────────────────────────────────────────

    @GetMapping("/recommend")
    public ResponseEntity<?> findHospitals(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(required = false) String speciality,
            @RequestParam(required = false) String excludeIds,
            @RequestParam(defaultValue = "25") Integer maxDistance) {
        try {
            List<Long> excluded = null;
            if (excludeIds != null && !excludeIds.isBlank()) {
                excluded = Arrays.stream(excludeIds.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(Long::parseLong)
                        .collect(Collectors.toList());
            }
            List<PatientHospitalResult> results =
                    recommendService.findHospitalsForPatient(lat, lng, speciality, excluded, maxDistance);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Failed to find hospitals for patient: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── JWT PROTECTED: Incoming Patient Requests ─────────────────────────────

    @GetMapping("/incoming")
    public ResponseEntity<?> getIncomingRequests() {
        try {
            String email = SecurityContextHolder.getContext().getAuthentication().getName();
            List<PatientStatusResponse> requests = patientService.getIncomingRequests(email);
            return ResponseEntity.ok(requests);
        } catch (Exception e) {
            log.error("Failed to get incoming patient requests: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── JWT PROTECTED: Confirm Patient Request ───────────────────────────────

    @PutMapping("/request/{id}/confirm")
    public ResponseEntity<?> confirmRequest(
            @PathVariable Long id,
            @RequestBody Map<String, Long> body) {
        try {
            Long doctorId = body.get("doctorId");
            if (doctorId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "doctorId is required"));
            }
            String email = SecurityContextHolder.getContext().getAuthentication().getName();
            PatientStatusResponse response = patientService.confirmRequest(id, doctorId, email);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to confirm patient request {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─── JWT PROTECTED: Reject Patient Request ────────────────────────────────

    @PutMapping("/request/{id}/reject")
    public ResponseEntity<?> rejectRequest(@PathVariable Long id) {
        try {
            String email = SecurityContextHolder.getContext().getAuthentication().getName();
            PatientStatusResponse response = patientService.rejectRequest(id, email);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to reject patient request {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}
