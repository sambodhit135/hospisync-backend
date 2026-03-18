package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.RecommendationResponse;
import hospital.Hospisync_backend.service.RecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/recommend")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    @GetMapping("/{hospitalId}")
    public ResponseEntity<?> getRecommendations(
            @PathVariable Long hospitalId,
            @RequestParam(required = false) Double maxDistance,
            @RequestParam Map<String, String> allParams) {
        
        try {
            List<RecommendationResponse> recommendations =
                    recommendationService.getRecommendations(hospitalId, maxDistance, allParams);
            return ResponseEntity.ok(recommendations);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to load recommendations: " + e.getMessage()));
        }
    }
}
