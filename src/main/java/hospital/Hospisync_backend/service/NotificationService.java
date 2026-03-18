package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.Notification;
import hospital.Hospisync_backend.repository.NotificationRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final HospitalRepository hospitalRepository;

    @Transactional(readOnly = true)
    public List<Notification> getNotifications(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        return notificationRepository.findByHospitalOrderByCreatedAtDesc(hospital);
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        return notificationRepository.countByHospitalAndIsReadFalse(hospital);
    }

    public void markAsRead(Long notificationId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            n.setIsRead(true);
            notificationRepository.save(n);
        });
    }

    public void markAllAsRead(Long hospitalId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        List<Notification> unread = notificationRepository.findByHospitalAndIsReadFalseOrderByCreatedAtDesc(hospital);
        unread.forEach(n -> n.setIsRead(true));
        notificationRepository.saveAll(unread);
    }

    public void createNotification(Hospital hospital, String message, String type) {
        Notification notification = Notification.builder()
                .hospital(hospital)
                .message(message)
                .type(type)
                .isRead(false)
                .build();
        notificationRepository.save(notification);
    }
}
