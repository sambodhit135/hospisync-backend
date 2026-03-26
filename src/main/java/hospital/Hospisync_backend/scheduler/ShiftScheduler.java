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
        
            // Check for legacy doctors with null shift fields
            if (doctor.getShiftStart() == null || doctor.getShiftEnd() == null || doctor.getWorkDays() == null) {
                continue; // Skip doctors without shift configuration
            }
            
            // Parse shift times
            LocalTime start = LocalTime.parse(doctor.getShiftStart());
            LocalTime end = LocalTime.parse(doctor.getShiftEnd());
                
            // Check if today is a work day
            boolean isWorkDay = Arrays.asList(doctor.getWorkDays().split(",")).contains(todayAbbr);
                
            // Check if within shift hours
            boolean isShiftTime = now.isAfter(start) && now.isBefore(end);
                
            String currentType = (doctor.getAvailabilityType() != null) ? doctor.getAvailabilityType() : "PRESENT";
            boolean currentAvail = (doctor.getIsAvailable() != null) ? doctor.getIsAvailable() : true;
            
            String newType = currentType;
            boolean newAvail = currentAvail;

            if (isWorkDay && isShiftTime) {
                // Should be PRESENT unless manually set to OFF_DUTY
                if (!"OFF_DUTY".equals(currentType)) {
                    newType = "PRESENT";
                    newAvail = true;
                }
            } else {
                // Outside shift — only mark OFF_DUTY if they were specifically PRESENT
                if ("PRESENT".equals(currentType)) {
                    newType = "OFF_DUTY";
                    newAvail = false;
                }
            }
            
            if (!newType.equals(currentType) || newAvail != currentAvail) {
                doctor.setAvailabilityType(newType);
                doctor.setIsAvailable(newAvail);
                doctorRepo.save(doctor);
            }
        }
        
        log.info("Shift check complete. Updated {} doctors", allDoctors.size());
    }
}
