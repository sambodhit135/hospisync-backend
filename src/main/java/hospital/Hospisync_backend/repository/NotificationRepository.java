package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Notification;
import hospital.Hospisync_backend.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByHospitalOrderByCreatedAtDesc(Hospital hospital);
    List<Notification> findByHospitalAndIsReadFalseOrderByCreatedAtDesc(Hospital hospital);
    long countByHospitalAndIsReadFalse(Hospital hospital);
}
