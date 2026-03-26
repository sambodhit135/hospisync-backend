package hospital.Hospisync_backend.scheduler;

import hospital.Hospisync_backend.model.PatientRequest;
import hospital.Hospisync_backend.repository.PatientRequestRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Component
@Slf4j
public class PatientEscalationScheduler {

    @Autowired
    private PatientRequestRepository repo;

    @Scheduled(fixedDelay = 60000)
    public void checkExpiredRequests() {
        List<PatientRequest> expired = repo.findByStatusAndExpiresAtBefore(
                "PENDING", LocalDateTime.now());

        if (!expired.isEmpty()) {
            log.info("PatientEscalationScheduler: found {} expired requests", expired.size());
        }

        for (PatientRequest req : expired) {
            req.setStatus("TIMEOUT");
            repo.save(req);
            log.info("Patient request {} timed out (hospital: {}, urgency: {})",
                    req.getId(), req.getHospitalName(), req.getUrgencyLevel());
        }
    }
}
