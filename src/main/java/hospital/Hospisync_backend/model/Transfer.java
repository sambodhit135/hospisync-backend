package hospital.Hospisync_backend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import hospital.Hospisync_backend.utils.JsonMapConverter;
import com.fasterxml.jackson.annotation.JsonFormat;
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

    // Helper alias for frontend code that explicitly checks for transferId in JSON payload
    @com.fasterxml.jackson.annotation.JsonProperty("transferId")
    public Long getTransferId() {
        return this.id;
    }

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
    private String status; // PENDING, APPROVED, REJECTED, COMPLETED

    @Column(nullable = false)
    private String priority; // EMERGENCY, CRITICAL, NORMAL

    // ===== Two-Stage Timer Fields =====

    /**
     * Stage of the two-stage handshake process.
     * Values: PENDING, ACKNOWLEDGED, APPROVED, REJECTED,
     *         TIMEOUT_STAGE1, TIMEOUT_STAGE2, NO_HOSPITAL_AVAILABLE
     */
    @Column(nullable = false)
    @Builder.Default
    private String stage = "PENDING";

    /** Deadline for Hospital B to acknowledge (createdAt + 2 min) */
    @Column(name = "acknowledge_by")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime acknowledgeBy;

    /** Actual time Hospital B clicked Acknowledge */
    @Column(name = "acknowledged_at")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime acknowledgedAt;

    /** Deadline for Hospital B to confirm with doctor (acknowledgedAt + 3 min) */
    @Column(name = "confirm_by")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime confirmBy;

    /** Actual time Hospital B confirmed the transfer */
    @Column(name = "confirmed_at")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime confirmedAt;

    /** Doctor ID assigned by Hospital B at Stage 2 */
    @Column(name = "assigned_doctor_id")
    private Long assignedDoctorId;

    /** Escalation attempt number (1-based) */
    @Column(name = "attempt_number")
    @Builder.Default
    private Integer attemptNumber = 1;

    /**
     * JSON array of hospital IDs already tried during escalation.
     * e.g. "[1, 3, 5]"
     */
    @Column(name = "hospitals_tried", columnDefinition = "TEXT")
    @Builder.Default
    private String hospitalsTried = "[]";

    // ===== Original timestamp fields =====

    @Column(name = "created_at")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    @Column(name = "approved_at")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime approvedAt;

    @Column(name = "completed_at")
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
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
        if (this.stage == null) {
            this.stage = "PENDING";
        }
        if (this.attemptNumber == null) {
            this.attemptNumber = 1;
        }
        if (this.hospitalsTried == null) {
            this.hospitalsTried = "[]";
        }
        // Set Stage 1 deadline: 2 minutes from now
        if (this.acknowledgeBy == null) {
            this.acknowledgeBy = this.createdAt.plusMinutes(2);
        }
    }
}
