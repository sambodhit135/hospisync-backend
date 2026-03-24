package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "doctor")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Doctor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(nullable = false)
    private String name;

    private String email;
    private String phone;

    @Column(nullable = false)
    private String speciality;

    private String qualification;
    private Integer experienceYears;

    @Builder.Default
    private Boolean isAvailable = true;

    @Builder.Default
    private Integer currentPatientCount = 0;

    @Builder.Default
    private Integer safeLimit = 12;

    @Column(name = "availability_type")
    @Builder.Default
    private String availabilityType = "PRESENT";

    @Column(name = "shift_start")
    @Builder.Default
    private String shiftStart = "08:00";

    @Column(name = "shift_end")
    @Builder.Default
    private String shiftEnd = "16:00";

    @Column(name = "work_days")
    @Builder.Default
    private String workDays = "MON,TUE,WED,THU,FRI";

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
