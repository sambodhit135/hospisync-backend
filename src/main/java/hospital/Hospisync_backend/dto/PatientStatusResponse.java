package hospital.Hospisync_backend.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PatientStatusResponse {

    private Long requestId;
    private String status;
    private String patientName;
    private String patientPhone;
    private String hospitalName;
    private String urgencyLevel;
    private LocalDateTime expiresAt;
    private String assignedDoctorName;
    private String assignedDoctorSpeciality;
    private String hospitalAddress;
    private NextHospitalDto nextHospital;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class NextHospitalDto {
        private Long hospitalId;
        private String hospitalName;
        private Double distanceKm;
        private Integer availableBeds;
        private String availableDoctorName;
        private String availableDoctorSpeciality;
    }
}
