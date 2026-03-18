package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.model.Notification;
import hospital.Hospisync_backend.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/{hospitalId}")
    public ResponseEntity<?> getNotifications(@PathVariable Long hospitalId) {
        try {
            List<Notification> notifications = notificationService.getNotifications(hospitalId);
            long unreadCount = notificationService.getUnreadCount(hospitalId);
            return ResponseEntity.ok(Map.of(
                    "notifications", notifications,
                    "unreadCount", unreadCount
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{notificationId}/read")
    public ResponseEntity<?> markAsRead(@PathVariable Long notificationId) {
        notificationService.markAsRead(notificationId);
        return ResponseEntity.ok(Map.of("message", "Notification marked as read"));
    }

    @PutMapping("/read-all/{hospitalId}")
    public ResponseEntity<?> markAllAsRead(@PathVariable Long hospitalId) {
        notificationService.markAllAsRead(hospitalId);
        return ResponseEntity.ok(Map.of("message", "All notifications marked as read"));
    }
}
