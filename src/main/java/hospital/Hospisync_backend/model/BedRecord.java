package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "bed_records")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BedRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "record_id")
    private Long recordId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "icu_occupied", nullable = false)
    private Integer icuOccupied = 0;

    @Column(name = "decare_occupied", nullable = false)
    private Integer decareOccupied = 0;

    @Column(name = "general_occupied", nullable = false)
    private Integer generalOccupied = 0;

    @Column(name = "childcare_occupied", nullable = false)
    private Integer childcareOccupied = 0;

    @Column(name = "essential_occupied", nullable = false)
    private Integer essentialOccupied = 0;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @PrePersist
    protected void onCreate() {
        this.timestamp = LocalDateTime.now();
    }

    public int getTotalOccupied() {
        return icuOccupied + decareOccupied + generalOccupied + childcareOccupied + essentialOccupied;
    }
}
