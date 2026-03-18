package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ForecastResponse {
    private Long hospitalId;
    private int predictedPatients;
    private String method;
    private int dataPointsUsed;
    
    private double forecast6h;
    private double forecast12h;
    private double forecast24h;
    private double rmse;
    private double mae;
    private String modelUsed;
    private boolean scarcityAlert;
    private String alertMessage;
    private java.util.List<DataPoint> historicalData;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DataPoint {
        private String timestamp;
        private int occupancy;
    }
}
