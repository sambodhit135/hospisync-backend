package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardResponse {
    private Long id;
    private String hospitalName;

    // Total summary
    private int totalBeds;
    private int occupiedBeds;
    private int availableBeds;
    private double occupancyRate;
    private String utilizationStatus; // UNDERUTILIZED, MODERATE, OVERUTILIZED

    // Dynamic bed categories
    private List<BedCategoryInfo> categories;

    // Metadata
    private LocalDateTime lastUpdated;
    private String lastUpdatedAgo;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BedCategoryInfo {
        private Long categoryId;
        private String name;
        private String icon;
        private int total;
        private int occupied;
        private int available;
    }
}
