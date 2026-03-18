package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HospitalDetailResponse {
    private Long id;
    private String hospitalName;
    private String address;
    private double distance;
    private String estimatedTravelTime;
    private String utilizationStatus;
    private double occupancyRate;
    private int totalBeds;
    private int occupiedBeds;
    private int availableBeds;
    private List<BedCategoryDetail> categories;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BedCategoryDetail {
        private String categoryName;
        private String icon;
        private int total;
        private int occupied;
        private int available;
    }
}
