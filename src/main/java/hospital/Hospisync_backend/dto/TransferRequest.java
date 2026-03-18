package hospital.Hospisync_backend.dto;

import lombok.Data;

@Data
public class TransferRequest {
    private Long fromHospitalId;
    private Long toHospitalId;
    private Integer patientCount;
    private java.util.Map<String, Integer> bedAllocations;
    private String priority;
}
