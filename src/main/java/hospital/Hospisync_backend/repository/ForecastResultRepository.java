package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.ForecastResult;
import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ForecastResultRepository extends JpaRepository<ForecastResult, Long> {
    Optional<ForecastResult> findFirstByHospitalOrderByCreatedAtDesc(Hospital hospital);
}
