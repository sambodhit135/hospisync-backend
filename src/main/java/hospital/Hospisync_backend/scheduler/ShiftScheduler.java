package hospital.Hospisync_backend.scheduler;

import hospital.Hospisync_backend.model.Doctor;
import hospital.Hospisync_backend.repository.DoctorRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;

@Component
@Slf4j
public class ShiftScheduler {

    @Autowired DoctorRepository doctorRepo;

    @Scheduled(fixedDelay = 3600000)
    // Runs every 1 hour
    public void updateDoctorAvailability() {
    
        LocalTime now = LocalTime.now();
        DayOfWeek today = LocalDate.now().getDayOfWeek();
        String todayAbbr = today.name().substring(0, 3);
            
        List<Doctor> allDoctors = doctorRepo.findAll();
            
        for (Doctor doctor : allDoctors) {
        
            // Parse shift times
            LocalTime start = LocalTime.parse(doctor.getShiftStart());
            LocalTime end = LocalTime.parse(doctor.getShiftEnd());
                
            // Check if today is a work day
            boolean isWorkDay = Arrays.asList(doctor.getWorkDays().split(",")).contains(todayAbbr);
                
            // Check if within shift hours
            boolean isShiftTime = now.isAfter(start) && now.isBefore(end);
                
            // Only update if not manually set to OFF_DUTY by admin (respect manual overrides)
            if (isWorkDay && isShiftTime) {
                if (!"OFF_DUTY".equals(doctor.getAvailabilityType())) {
                    doctor.setAvailabilityType("PRESENT");
                    doctor.setIsAvailable(true);
                }
            } else {
                // Outside shift — mark off. But respect ON_CALL status
                if ("PRESENT".equals(doctor.getAvailabilityType())) {
                    doctor.setAvailabilityType("OFF_DUTY");
                    doctor.setIsAvailable(false);
                }
            }
            
            doctorRepo.save(doctor);
        }
        
        log.info("Shift check complete. Updated {} doctors", allDoctors.size());
    }
}
