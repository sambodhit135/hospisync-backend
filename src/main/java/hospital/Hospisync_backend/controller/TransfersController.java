package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.security.JwtUtil;
import hospital.Hospisync_backend.service.TransferService;
import hospital.Hospisync_backend.dto.TransferRequest;
import lombok.RequiredArgsConstructor;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/transfer")
@RequiredArgsConstructor
public class TransfersController {

    private final TransferService transferService;
    private final JwtUtil jwtUtil;

    @PostMapping("/request")
    public ResponseEntity<?> createTransfer(@RequestBody TransferRequest request) {
        try {
            System.out.println("Processing transfer request: " + request);
            Transfer saved = transferService.createTransfer(
                    request.getFromHospitalId(),
                    request.getToHospitalId(),
                    request.getPatientCount(),
                    request.getBedAllocations(),
                    request.getPriority()
            );
            return ResponseEntity.ok(saved);
        } catch (RuntimeException e) {
            System.err.println("Transfer creation failed: " + e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/outgoing/{hospitalId}")
    public ResponseEntity<?> getOutgoingTransfers(@PathVariable Long hospitalId) {
        try {
            return ResponseEntity.ok(transferService.getOutgoingTransfers(hospitalId));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/incoming/{hospitalId}")
    public ResponseEntity<?> getIncomingTransfers(@PathVariable Long hospitalId) {
        try {
            return ResponseEntity.ok(transferService.getIncomingTransfers(hospitalId));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(
            @PathVariable Long id, 
            @RequestBody Map<String, Object> body,
            @RequestHeader("Authorization") String authHeader) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return ResponseEntity.status(401).body(Map.of("error", "Missing or invalid Authorization header"));
            }
            
            String token = authHeader.substring(7);
            if (!jwtUtil.validateToken(token)) {
                return ResponseEntity.status(401).body(Map.of("error", "Invalid or expired token"));
            }

            Long hospitalId = jwtUtil.getHospitalIdFromToken(token);
            if (hospitalId == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Hospital ID not found in token"));
            }

            String status = body.get("status").toString();
            
            Transfer updated = transferService.updateTransferStatus(id, hospitalId, status);
            return ResponseEntity.ok(Map.of(
                    "message", "Transfer status updated successfully to " + status,
                    "transferId", updated.getId(),
                    "status", updated.getStatus()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
