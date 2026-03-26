package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.PatientRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface PatientRequestRepository extends JpaRepository<PatientRequest, Long> {

    List<PatientRequest> findByHospitalIdAndStatusIn(Long hospitalId, List<String> statuses);

    List<PatientRequest> findByStatusAndExpiresAtBefore(String status, LocalDateTime time);

    List<PatientRequest> findByStatus(String status);
}
