package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.BedCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BedCategoryRepository extends JpaRepository<BedCategory, Long> {

    List<BedCategory> findByHospitalIdOrderByCategoryIdAsc(Long hospitalId);

    Optional<BedCategory> findByCategoryIdAndHospitalId(Long categoryId, Long hospitalId);

    void deleteAllByHospitalId(Long hospitalId);
}
