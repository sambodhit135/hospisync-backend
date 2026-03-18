package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MapDataResponse {
    private Long id;
    private String hospitalName;
    private Double latitude;
    private Double longitude;
    private String utilizationStatus;
    private double occupancyRate;
}
