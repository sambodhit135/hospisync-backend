package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "patient_admissions_v2")
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

    @Column(name = "date", nullable = false)
    private java.time.LocalDate date;

    @Column(name = "admission_count", nullable = false)
    private Integer admissionCount;
}
