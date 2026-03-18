package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.AuthRequest;
import hospital.Hospisync_backend.dto.AuthResponse;
import hospital.Hospisync_backend.dto.RegisterRequest;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.User;
import hospital.Hospisync_backend.repository.UserRepository;
import hospital.Hospisync_backend.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final BedCategoryService bedCategoryService;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        Hospital hospital = Hospital.builder()
                .hospitalName(request.getHospitalName())
                .email(request.getEmail())
                .govId(request.getGovId())
                .contactNumber(request.getContactNumber())
                .address(request.getAddress())
                .latitude(request.getLatitude() != null ? request.getLatitude() : 0.0)
                .longitude(request.getLongitude() != null ? request.getLongitude() : 0.0)
                .setupCompleted(false)
                .build();

        User user = User.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role("HOSPITAL_ADMIN")
                .hospital(hospital)
                .build();

        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getEmail(), hospital.getId());

        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .id(hospital.getId())
                .hospitalName(hospital.getHospitalName())
                .setupCompleted(hospital.isSetupCompleted())
                .build();
    }

    public AuthResponse login(AuthRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid email or password");
        }

        Hospital hospital = user.getHospital();
        String token = jwtUtil.generateToken(user.getEmail(), hospital.getId());

        System.out.println("DEBUG: Login for " + user.getEmail() + ", setupCompleted: " + hospital.isSetupCompleted());

        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .id(hospital.getId())
                .hospitalName(hospital.getHospitalName())
                .setupCompleted(hospital.isSetupCompleted())
                .build();
    }
}
