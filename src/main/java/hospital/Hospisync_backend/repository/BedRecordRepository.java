package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.BedRecord;
import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BedRecordRepository extends JpaRepository<BedRecord, Long> {
    List<BedRecord> findByHospitalOrderByTimestampDesc(Hospital hospital);
    Optional<BedRecord> findFirstByHospitalOrderByTimestampDesc(Hospital hospital);
    List<BedRecord> findTop100ByHospitalOrderByTimestampAsc(Hospital hospital);
}
