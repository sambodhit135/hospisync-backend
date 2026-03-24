package hospital.Hospisync_backend.scheduler;

import hospital.Hospisync_backend.model.Transfer;
import hospital.Hospisync_backend.repository.TransferRepository;
import hospital.Hospisync_backend.service.TransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Runs every 30 seconds and handles the two-stage timer escalation for patient transfers.
 *
 * Stage 1: If a transfer stays in PENDING beyond acknowledgeBy → TIMEOUT_STAGE1 + escalate
 * Stage 2: If a transfer stays in ACKNOWLEDGED beyond confirmBy → TIMEOUT_STAGE2 + escalate
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TransferEscalationScheduler {

    private final TransferRepository transferRepository;
    private final TransferService transferService;

    @Scheduled(fixedDelay = 30000)
    @Transactional
    public void checkTransferTimeouts() {
        LocalDateTime now = LocalDateTime.now();
        log.debug("Running transfer escalation check at {}", now);

        checkStage1Timeouts(now);
        checkStage2Timeouts(now);
    }

    /**
     * Stage 1: PENDING transfers that have passed their acknowledgeBy deadline
     */
    private void checkStage1Timeouts(LocalDateTime now) {
        List<Transfer> timedOut = transferRepository.findByStageAndAcknowledgeByBefore("PENDING", now);

        if (!timedOut.isEmpty()) {
            log.info("Found {} PENDING transfer(s) that timed out at Stage 1", timedOut.size());
        }

        for (Transfer transfer : timedOut) {
            try {
                log.info("Stage 1 timeout for transfer {} → hospital {} did not acknowledge in time",
                        transfer.getId(), transfer.getToHospital().getId());

                transfer.setStage("TIMEOUT_STAGE1");
                transfer.setStatus("REJECTED");
                transferRepository.save(transfer);

                transferService.escalateToNextHospital(transfer);

            } catch (Exception e) {
                log.error("Error processing Stage 1 timeout for transfer {}: {}", transfer.getId(), e.getMessage(), e);
            }
        }
    }

    /**
     * Stage 2: ACKNOWLEDGED transfers that have passed their confirmBy deadline
     */
    private void checkStage2Timeouts(LocalDateTime now) {
        List<Transfer> timedOut = transferRepository.findByStageAndConfirmByBefore("ACKNOWLEDGED", now);

        if (!timedOut.isEmpty()) {
            log.info("Found {} ACKNOWLEDGED transfer(s) that timed out at Stage 2", timedOut.size());
        }

        for (Transfer transfer : timedOut) {
            try {
                log.info("Stage 2 timeout for transfer {} → hospital {} acknowledged but did not confirm in time",
                        transfer.getId(), transfer.getToHospital().getId());

                transfer.setStage("TIMEOUT_STAGE2");
                transfer.setStatus("REJECTED");
                transferRepository.save(transfer);

                transferService.escalateToNextHospital(transfer);

            } catch (Exception e) {
                log.error("Error processing Stage 2 timeout for transfer {}: {}", transfer.getId(), e.getMessage(), e);
            }
        }
    }
}
