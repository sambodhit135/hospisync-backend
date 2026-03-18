package hospital.Hospisync_backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    public void sendDataUpdateReminder(String toEmail, String hospitalName) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("Hospital Data Update Reminder – HospiSync");
            message.setText(
                "Dear " + hospitalName + " Administrator,\n\n" +
                "Your hospital has not updated bed data in the last 24 hours.\n" +
                "Please update your data to maintain accurate forecasting.\n\n" +
                "Log in to HospiSync and update your bed occupancy data now.\n\n" +
                "Best regards,\nHospiSync System"
            );
            mailSender.send(message);
            log.info("Sent reminder email to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", toEmail, e.getMessage());
        }
    }
    public void sendTransferRequestCreatedEmail(String toEmail, String receivingHospitalName, String sendingHospitalName, int patientCount) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("New Patient Transfer Request");
            message.setText(
                "Dear " + receivingHospitalName + " Administrator,\n\n" +
                "You have received a transfer request from " + sendingHospitalName + " for " + patientCount + " patients.\n" +
                "Please review and approve or reject the request in your HospiSync dashboard.\n\n" +
                "Best regards,\nHospiSync System"
            );
            mailSender.send(message);
            log.info("Sent transfer request email to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send transfer request email to {}: {}", toEmail, e.getMessage());
        }
    }

    public void sendTransferApprovedEmail(String toEmail, String destinationHospitalName) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("Transfer Request Approved");
            message.setText(
                "Good news!\n\n" +
                "Your transfer request to " + destinationHospitalName + " has been approved.\n" +
                "Please coordinate the physical transfer of patients.\n\n" +
                "Best regards,\nHospiSync System"
            );
            mailSender.send(message);
            log.info("Sent transfer approval email to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send transfer approval email to {}: {}", toEmail, e.getMessage());
        }
    }

    public void sendTransferRejectedEmail(String toEmail, String destinationHospitalName) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(toEmail);
            message.setSubject("Transfer Request Rejected");
            message.setText(
                "Notice regarding your recent request:\n\n" +
                "Your transfer request to " + destinationHospitalName + " has been rejected due to limited capacity or other constraints.\n" +
                "Please review other recommended hospitals in your HospiSync dashboard.\n\n" +
                "Best regards,\nHospiSync System"
            );
            mailSender.send(message);
            log.info("Sent transfer rejection email to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send transfer rejection email to {}: {}", toEmail, e.getMessage());
        }
    }
}
