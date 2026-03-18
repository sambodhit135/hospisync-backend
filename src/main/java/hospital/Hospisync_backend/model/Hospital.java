package hospital.Hospisync_backend.model;

import hospital.Hospisync_backend.utils.JsonMapConverter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "hospitals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Hospital {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "hospital_id")
    private Long id;

    @Column(name = "hospital_name", nullable = false)
    private String hospitalName;

    @Column(name = "gov_id", nullable = false, unique = true)
    private String govId;

    @Column(nullable = false)
    private String email;

    @Column(name = "contact_number")
    private String contactNumber;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;


    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    @Builder.Default
    @Column(name = "setup_completed", nullable = false, columnDefinition = "BIT(1) DEFAULT 0")
    private boolean setupCompleted = false;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.lastUpdated = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.lastUpdated = LocalDateTime.now();
    }
}
