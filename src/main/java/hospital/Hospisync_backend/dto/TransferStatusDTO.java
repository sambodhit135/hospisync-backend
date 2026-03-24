package hospital.Hospisync_backend.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO returned by GET /api/transfer/{id}/status
 * Used by the sender-side for polling the live status of a transfer they initiated.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TransferStatusDTO {

    private Long transferId;
    private String stage;         // PENDING | ACKNOWLEDGED | APPROVED | REJECTED | TIMEOUT_STAGE1 | TIMEOUT_STAGE2 | COMPLETED
    private String status;        // Legacy status field (PENDING/APPROVED/REJECTED/COMPLETED)

    private String toHospitalName;
    private Long toHospitalId;

    private Integer totalPatients;
    private String priority;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime acknowledgeBy;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime confirmBy;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    private String assignedDoctorName;

    /** Populated when stage = TIMEOUT_STAGE1 | TIMEOUT_STAGE2 | REJECTED */
    private NextHospitalDTO nextHospital;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class NextHospitalDTO {
        private Long hospitalId;
        private String hospitalName;
        private Double distanceKm;
        private Integer availableBeds;
        private Double score;
        private String availableDoctorName;
        private String availableDoctorSpeciality;
    }
}
