package hospital.Hospisync_backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {
    @NotBlank private String hospitalName;
    @NotBlank @Email private String email;
    @NotBlank private String password;
    @NotBlank private String govId;
    private String contactNumber;
    private String address;
    private Double latitude;
    private Double longitude;
}
