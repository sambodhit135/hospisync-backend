package hospital.Hospisync_backend.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DoctorResponseDto {
    private Long id;
    private String name;
    private String email;
    private String phone;
    private String speciality;
    private String qualification;
    private Integer experienceYears;
    private Boolean isAvailable;
    private Integer currentPatientCount;
    private Integer safeLimit;
    private Integer remainingCapacity;
    private String availabilityStatus;
    private String availabilityType;
    private String shiftInfo;
    private String availabilityColor;

    public void calculateCapacity() {
        this.remainingCapacity = (this.safeLimit != null ? this.safeLimit : 12) - (this.currentPatientCount != null ? this.currentPatientCount : 0);
        
        if (this.currentPatientCount == null || this.safeLimit == null || this.safeLimit == 0) {
            this.availabilityStatus = "AVAILABLE";
            return;
        }

        double ratio = (double) this.currentPatientCount / this.safeLimit;
        if (this.currentPatientCount >= this.safeLimit) {
            this.availabilityStatus = "AT_LIMIT";
        } else if (ratio >= 0.8) {
            this.availabilityStatus = "NEAR_LIMIT";
        } else {
            this.availabilityStatus = "AVAILABLE";
        }
    }
}
