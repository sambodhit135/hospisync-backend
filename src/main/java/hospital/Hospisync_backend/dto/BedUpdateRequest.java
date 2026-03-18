package hospital.Hospisync_backend.dto;

import lombok.Data;

@Data
public class BedUpdateRequest {
    private Integer icuOccupied;
    private Integer decareOccupied;
    private Integer generalOccupied;
    private Integer childcareOccupied;
    private Integer essentialOccupied;
}
