package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.PatientAdmission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
public interface PatientAdmissionRepository extends JpaRepository<PatientAdmission, Long> {

    @Query(value = "SELECT DATE(admission_time) as day, COUNT(*) as patients " +
                   "FROM patient_admissions " +
                   "WHERE hospital_id = :hospitalId " +
                   "GROUP BY DATE(admission_time) " +
                   "ORDER BY day DESC " +
                   "LIMIT 7", nativeQuery = true)
    List<Map<String, Object>> findDailyCountsLast7Days(@Param("hospitalId") Long hospitalId);
}
