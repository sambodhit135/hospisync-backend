package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.ForecastResponse;
import hospital.Hospisync_backend.service.ForecastService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/forecast")
@RequiredArgsConstructor
public class ForecastController {

    private final ForecastService forecastService;

    @GetMapping("/{hospitalId}")
    public ResponseEntity<?> getForecast(@PathVariable Long hospitalId) {
        try {
            ForecastResponse forecast = forecastService.getForecast(hospitalId);
            
            if (forecast == null) {
                // Return default values as requested
                forecast = ForecastResponse.builder()
                        .hospitalId(hospitalId)
                        .method("Statistical")
                        .predictedPatients(0)
                        .dataPointsUsed(0)
                        .scarcityAlert(false)
                        .alertMessage("No historical data")
                        .build();
            }
            return ResponseEntity.ok(forecast);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Forecast generation failed: " + e.getMessage());
        }
    }

    @GetMapping("/next-day/{hospitalId}")
    public ResponseEntity<?> getNextDayForecast(@PathVariable Long hospitalId) {
        try {
            ForecastResponse forecast = forecastService.getForecast(hospitalId);
            
            if (forecast == null) {
                // Return default values as requested
                forecast = ForecastResponse.builder()
                        .hospitalId(hospitalId)
                        .method("Statistical")
                        .predictedPatients(0)
                        .dataPointsUsed(0)
                        .scarcityAlert(false)
                        .alertMessage("No historical data")
                        .build();
            }
            return ResponseEntity.ok(forecast);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Forecast generation failed: " + e.getMessage());
        }
    }
}
