package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface HospitalRepository extends JpaRepository<Hospital, Long> {
    Optional<Hospital> findByGovId(String govId);

    @Query("SELECT h FROM Hospital h WHERE h.id != :excludeId")
    List<Hospital> findAllExcept(@org.springframework.data.repository.query.Param("excludeId") Long excludeId);

    List<Hospital> findByLastUpdatedBefore(LocalDateTime threshold);
}
