package hospital.Hospisync_backend.dto;

import lombok.Data;

@Data
public class BedCategoryRequest {
    private String categoryName;
    private String icon;
    private Integer totalCapacity;
    private Integer occupiedBeds;
}
