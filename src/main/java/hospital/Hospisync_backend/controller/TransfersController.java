package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.security.JwtUtil;
import hospital.Hospisync_backend.service.TransferService;
import hospital.Hospisync_backend.service.RecommendationService;
import hospital.Hospisync_backend.dto.TransferRequest;
import hospital.Hospisync_backend.dto.TransferStatusDTO;
import lombok.RequiredArgsConstructor;

import java.util.Map;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;


@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/transfer")
@RequiredArgsConstructor
public class TransfersController {

    private final TransferService transferService;
    private final RecommendationService recommendationService;
    private final JwtUtil jwtUtil;

    // =============================================
    // EXISTING ENDPOINTS
    // =============================================

    @PostMapping("/request")
    public ResponseEntity<?> createTransfer(@RequestBody TransferRequest request) {
        try {
            Transfer saved = transferService.createTransfer(
                    request.getFromHospitalId(),
                    request.getToHospitalId(),
                    request.getPatientCount(),
                    request.getBedAllocations(),
                    request.getPriority()
            );
            return ResponseEntity.ok(saved);
        } catch (RuntimeException e) {
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
            Object statusObj = body.get("status");
            if (statusObj == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing 'status' field in request body"));
            }
            String status = statusObj.toString();
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

    // =============================================
    // NEW — TWO-STAGE TIMER ENDPOINTS
    // =============================================

    /**
     * Stage 1: Hospital B acknowledges the transfer request.
     * Called within 2 minutes of receiving the request.
     * PUT /api/transfer/{id}/acknowledge
     */
    @PutMapping("/{id}/acknowledge")
    public ResponseEntity<?> acknowledgeTransfer(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authHeader) {
        try {
            Long hospitalId = extractHospitalId(authHeader);
            if (hospitalId == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

            Transfer updated = transferService.acknowledgeTransfer(id, hospitalId);
            return ResponseEntity.ok(Map.of(
                    "message", "Transfer acknowledged. You have 3 minutes to assign a doctor.",
                    "transferId", updated.getId(),
                    "stage", updated.getStage(),
                    "confirmBy", updated.getConfirmBy().toString()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Stage 2: Hospital B confirms the transfer with an assigned doctor.
     * PUT /api/transfer/{id}/confirm
     */
    @PutMapping("/{id}/confirm")
    public ResponseEntity<?> confirmTransfer(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            @RequestHeader("Authorization") String authHeader) {
        try {
            Long hospitalId = extractHospitalId(authHeader);
            if (hospitalId == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

            Object doctorIdObj = body.get("doctorId");
            if (doctorIdObj == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Missing 'doctorId' field in request body"));
            }
            Long doctorId = Long.valueOf(doctorIdObj.toString());
            Transfer updated = transferService.confirmTransferWithDoctor(id, doctorId, hospitalId);
            return ResponseEntity.ok(Map.of(
                    "message", "Transfer confirmed! Doctor assigned.",
                    "transferId", updated.getId(),
                    "stage", updated.getStage()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Hospital B rejects the transfer at any stage.
     * Triggers automatic escalation to the next available hospital.
     * PUT /api/transfer/{id}/reject
     */
    @PutMapping("/{id}/reject")
    public ResponseEntity<?> rejectTransferWithEscalation(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authHeader) {
        try {
            Long hospitalId = extractHospitalId(authHeader);
            if (hospitalId == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

            Transfer updated = transferService.rejectTransfer(id, hospitalId);
            return ResponseEntity.ok(Map.of(
                    "message", "Transfer rejected. System is finding the next available hospital.",
                    "transferId", updated.getId(),
                    "stage", updated.getStage()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // =========================================
    // SENDER-SIDE POLLING ENDPOINT
    // =========================================

    /**
     * Sender polls this every 5s to see the current stage of their outgoing transfer.
     * When stage = TIMEOUT or REJECTED, the response includes next hospital recommendation.
     * GET /api/transfer/{id}/status
     */
    @GetMapping("/{id}/status")
    public ResponseEntity<?> getTransferStatus(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authHeader) {
        try {
            Long hospitalId = extractHospitalId(authHeader);
            if (hospitalId == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
            TransferStatusDTO dto = transferService.getTransferStatus(id, hospitalId, recommendationService);
            return ResponseEntity.ok(dto);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }


    /**
     * Returns active incoming transfers (PENDING or ACKNOWLEDGED) for the current hospital.
     * Used by frontend polling every 10 seconds.
     * NOTE: Hospital identity is extracted from JWT token — no hospitalId path variable needed.
     * GET /api/transfer/incoming/active
     */
    @GetMapping("/incoming/active")
    public ResponseEntity<?> getActiveIncomingByToken(
            @RequestHeader("Authorization") String authHeader) {
        try {
            Long hospitalId = extractHospitalId(authHeader);
            if (hospitalId == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
            List<Transfer> active = transferService.getActiveIncomingTransfers(hospitalId);
            return ResponseEntity.ok(active);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Returns active incoming transfers (PENDING or ACKNOWLEDGED) for the given hospital.
     * Used by frontend for polling every 10 seconds.
     * GET /api/transfer/incoming/pending/{hospitalId}
     */
    @GetMapping("/incoming/pending/{hospitalId}")
    public ResponseEntity<?> getActiveIncomingTransfers(@PathVariable Long hospitalId) {
        try {
            List<Transfer> active = transferService.getActiveIncomingTransfers(hospitalId);
            return ResponseEntity.ok(active);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // =============================================
    // HELPERS
    // =============================================

    private Long extractHospitalId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        return jwtUtil.getHospitalIdFromToken(token);
    }
}
