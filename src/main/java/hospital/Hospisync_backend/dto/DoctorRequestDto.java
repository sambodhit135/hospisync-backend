package hospital.Hospisync_backend.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DoctorRequestDto {
    private String name;
    private String email;
    private String phone;
    private String speciality;
    private String qualification;
    private Integer experienceYears;
    @Builder.Default
    private Integer safeLimit = 12;
    private String availabilityType;
    private String shiftStart;
    private String shiftEnd;
    private String workDays;
}
