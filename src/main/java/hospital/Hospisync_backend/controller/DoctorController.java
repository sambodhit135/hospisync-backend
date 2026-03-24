package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.DoctorRequestDto;
import hospital.Hospisync_backend.dto.DoctorResponseDto;
import hospital.Hospisync_backend.service.DoctorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/doctors")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DoctorController {

    private final DoctorService doctorService;

    private String getCurrentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    @PostMapping("/add")
    public ResponseEntity<DoctorResponseDto> addDoctor(@RequestBody DoctorRequestDto dto) {
        DoctorResponseDto response = doctorService.addDoctor(dto, getCurrentUserEmail());
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    @GetMapping("/all")
    public ResponseEntity<List<DoctorResponseDto>> getAllDoctors() {
        return ResponseEntity.ok(doctorService.getAllDoctors(getCurrentUserEmail()));
    }

    @GetMapping("/speciality/{speciality}")
    public ResponseEntity<List<DoctorResponseDto>> getDoctorsBySpeciality(@PathVariable String speciality) {
        return ResponseEntity.ok(doctorService.getDoctorsBySpeciality(getCurrentUserEmail(), speciality));
    }

    @GetMapping("/available")
    public ResponseEntity<List<DoctorResponseDto>> getAvailableDoctors() {
        return ResponseEntity.ok(doctorService.getAvailableDoctors(getCurrentUserEmail()));
    }

    @PutMapping("/{doctorId}/toggle")
    public ResponseEntity<DoctorResponseDto> toggleAvailability(@PathVariable Long doctorId) {
        try {
            return ResponseEntity.ok(doctorService.toggleAvailability(doctorId, getCurrentUserEmail()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @PutMapping("/{doctorId}/update-load")
    public ResponseEntity<?> updatePatientLoad(@PathVariable Long doctorId, @RequestBody Map<String, Integer> body) {
        Integer count = body.get("currentPatientCount");
        if (count == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "currentPatientCount is required"));
        }
        try {
            return ResponseEntity.ok(doctorService.updatePatientLoad(doctorId, count, getCurrentUserEmail()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{doctorId}/availability-type")
    public ResponseEntity<?> updateAvailabilityType(@PathVariable Long doctorId, @RequestBody Map<String, String> body) {
        String type = body.get("availabilityType");
        if (type == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "availabilityType is required"));
        }
        try {
            return ResponseEntity.ok(doctorService.updateAvailabilityType(doctorId, type, getCurrentUserEmail()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{doctorId}")
    public ResponseEntity<Map<String, String>> deleteDoctor(@PathVariable Long doctorId) {
        try {
            doctorService.deleteDoctor(doctorId, getCurrentUserEmail());
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
    }

    @GetMapping("/for-transfer")
    public ResponseEntity<?> getAvailableDoctorsForTransfer(
            @RequestParam Long hospitalId, 
            @RequestParam(required = false) String speciality) {
        if (hospitalId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "hospitalId is required"));
        }
        return ResponseEntity.ok(doctorService.getAvailableDoctorsForTransfer(hospitalId, speciality));
    }
}
