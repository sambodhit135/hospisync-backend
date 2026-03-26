package hospital.Hospisync_backend.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PatientRequestDto {

    private String patientName;
    private String patientPhone;
    private Integer patientAge;
    private String conditionDescription;
    private String specialityNeeded;
    private String urgencyLevel;
    private Double latitude;
    private Double longitude;
    private Long hospitalId;
    private String hospitalName;
    private Long doctorId;
    private String preferredTime;
}
