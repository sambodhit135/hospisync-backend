package hospital.Hospisync_backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "bed_categories")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BedCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "category_id")
    private Long categoryId;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "category_name", nullable = false)
    private String categoryName;

    @Builder.Default
    @Column(name = "icon", nullable = false)
    private String icon = "🛏️";

    @Builder.Default
    @Column(name = "total_capacity", nullable = false)
    private Integer totalCapacity = 0;

    @Builder.Default
    @Column(name = "occupied_beds", nullable = false)
    private Integer occupiedBeds = 0;

    @Builder.Default
    @Column(name = "future_reserved_beds", nullable = false)
    private Integer futureReservedBeds = 0;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public int getAvailableBeds() {
        return Math.max(0, totalCapacity - occupiedBeds);
    }
}
