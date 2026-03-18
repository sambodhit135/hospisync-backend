package hospital.Hospisync_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@AllArgsConstructor
@Builder
public class AuthResponse {
    private String token;
    private String email;
    private Long id;
    private String hospitalName;
    private boolean setupCompleted;
}
