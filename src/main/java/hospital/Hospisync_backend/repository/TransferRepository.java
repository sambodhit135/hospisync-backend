package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface TransferRepository extends JpaRepository<Transfer, Long> {

    // Original finders
    List<Transfer> findByFromHospitalOrToHospitalOrderByCreatedAtDesc(Hospital from, Hospital to);
    List<Transfer> findByFromHospitalOrderByCreatedAtDesc(Hospital hospital);
    List<Transfer> findByToHospitalOrderByCreatedAtDesc(Hospital hospital);
    
    boolean existsByFromHospitalIdAndStageIn(Long fromHospitalId, List<String> stages);

    // ===== Two-Stage Timer Finders =====

    /** Find PENDING transfers whose Stage 1 deadline has passed */
    List<Transfer> findByStageAndAcknowledgeByBefore(String stage, LocalDateTime time);

    /** Find ACKNOWLEDGED transfers whose Stage 2 deadline has passed */
    List<Transfer> findByStageAndConfirmByBefore(String stage, LocalDateTime time);

    /** Find active incoming transfers for a hospital (Stage 1 or 2) */
    List<Transfer> findByToHospitalIdAndStageIn(Long hospitalId, List<String> stages);
}
