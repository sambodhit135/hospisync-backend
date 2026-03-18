package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import hospital.Hospisync_backend.utils.JsonMapConverter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Entity
@Table(name = "patient_transfers")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Transfer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "transfer_id")
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "from_hospital_id", nullable = false)
    private Hospital fromHospital;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "to_hospital_id", nullable = false)
    private Hospital toHospital;

    @Column(name = "patient_count", nullable = false)
    private Integer patientCount;

    @Convert(converter = JsonMapConverter.class)
    @Column(name = "bed_allocations", columnDefinition = "JSON")
    @Builder.Default
    private Map<String, Integer> bedAllocations = new HashMap<>();

    @Column(nullable = false)
    private String status; // PENDING, ACCEPTED, REJECTED, COMPLETED

    @Column(nullable = false)
    private String priority; // EMERGENCY, CRITICAL, NORMAL

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "PENDING";
        }
        if (this.priority == null) {
            this.priority = "NORMAL";
        }
    }
}
