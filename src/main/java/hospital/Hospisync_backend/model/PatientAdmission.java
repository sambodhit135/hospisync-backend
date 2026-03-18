package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "patient_admissions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PatientAdmission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "admission_time", nullable = false)
    private LocalDateTime admissionTime;

    @Column(name = "department")
    private String department;

    @Column(name = "bed_id")
    private Long bedId;

    @PrePersist
    protected void onCreate() {
        if (this.admissionTime == null) {
            this.admissionTime = LocalDateTime.now();
        }
    }
}
