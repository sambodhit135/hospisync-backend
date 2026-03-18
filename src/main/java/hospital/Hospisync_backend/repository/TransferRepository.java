package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TransferRepository extends JpaRepository<Transfer, Long> {
    List<Transfer> findByFromHospitalOrToHospitalOrderByCreatedAtDesc(Hospital from, Hospital to);
    List<Transfer> findByFromHospitalOrderByCreatedAtDesc(Hospital hospital);
    List<Transfer> findByToHospitalOrderByCreatedAtDesc(Hospital hospital);
}
