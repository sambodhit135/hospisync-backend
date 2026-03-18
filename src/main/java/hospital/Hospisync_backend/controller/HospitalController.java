package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.DashboardResponse;
import hospital.Hospisync_backend.dto.HospitalDetailResponse;
import hospital.Hospisync_backend.dto.SetupRequest;
import hospital.Hospisync_backend.service.HospitalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/hospital")
@RequiredArgsConstructor
public class HospitalController {

    private final HospitalService hospitalService;

    @GetMapping("/{id}")
    public ResponseEntity<?> getHospital(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(hospitalService.getHospital(id));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/dashboard")
    public ResponseEntity<?> getDashboard(@PathVariable Long id) {
        try {
            DashboardResponse dashboard = hospitalService.getDashboard(id);
            if (dashboard == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Dashboard data not found"));
            }
            return ResponseEntity.ok(dashboard);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/details")
    public ResponseEntity<?> getHospitalDetails(
            @PathVariable Long id,
            @RequestParam(required = false) Long fromHospitalId) {
        try {
            HospitalDetailResponse details = hospitalService.getHospitalDetail(id, fromHospitalId);
            return ResponseEntity.ok(details);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/map-data")
    public ResponseEntity<?> getMapData() {
        try {
            return ResponseEntity.ok(hospitalService.getHospitalMapData());
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/setup-complete")
    public ResponseEntity<?> setupComplete(@RequestBody SetupRequest request) {
        try {
            hospitalService.setupComplete(request);
            return ResponseEntity.ok(Map.of("message", "Setup completed successfully"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

