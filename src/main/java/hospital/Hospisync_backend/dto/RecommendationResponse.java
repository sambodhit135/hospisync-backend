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
public class RecommendationResponse {
    private Long id;
    private String hospitalName;
    private String address;
    private double distance; // in km
    private String estimatedTravelTime;
    private int availableBeds;
    private double occupancyRate;
    private String utilizationStatus;
    private double score;
    private List<SplitAllocation> splitTransferPlan;
    private String hospitalPhone;

    // New Doctor Related Fields
    private String availableDoctorName;
    private String availableDoctorSpeciality;
    private Integer doctorRemainingCapacity;
    private Integer maxTransferablePatients;
    private Boolean hasDoctor;
    private Boolean isNearCapacity;
    private String capacityWarning;
    private String doctorAvailabilityType;
    private String doctorResponseTime;

}
