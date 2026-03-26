package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "patient_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PatientRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String patientName;

    @Column(nullable = false)
    private String patientPhone;

    private Integer patientAge;

    @Column(columnDefinition = "TEXT")
    private String conditionDescription;

    private String specialityNeeded;

    // TODAY / THIS_WEEK / PLANNED
    private String urgencyLevel;

    private Double latitude;
    private Double longitude;

    private Long hospitalId;
    private String hospitalName;
    private String preferredArrivalTime;

    // PENDING / CONFIRMED / REJECTED / CANCELLED / TIMEOUT / NO_HOSPITAL_AVAILABLE
    @Builder.Default
    private String status = "PENDING";

    private Long assignedDoctorId;
    private String assignedDoctorName;
    private String assignedDoctorSpeciality;

    private LocalDateTime createdAt;
    private LocalDateTime expiresAt;

    @Builder.Default
    private Integer attemptNumber = 1;

    @Column(columnDefinition = "TEXT")
    private String hospitalsTried; // JSON array like "[1,3,5]"

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.expiresAt == null) {
            if ("THIS_WEEK".equalsIgnoreCase(urgencyLevel)) {
                this.expiresAt = this.createdAt.plusHours(6);
            } else if ("PLANNED".equalsIgnoreCase(urgencyLevel)) {
                this.expiresAt = this.createdAt.plusHours(24);
            } else {
                // TODAY or default
                this.expiresAt = this.createdAt.plusMinutes(30);
            }
        }
    }
}
