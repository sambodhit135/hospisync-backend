package hospital.Hospisync_backend.scheduler;

import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.model.PatientAdmission;
import hospital.Hospisync_backend.repository.HospitalRepository;
import hospital.Hospisync_backend.repository.PatientAdmissionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements CommandLineRunner {

    private final PatientAdmissionRepository patientAdmissionRepository;
    private final HospitalRepository hospitalRepository;

    @Override
    public void run(String... args) {

        // Skip if data already exists
        if (patientAdmissionRepository.count() > 0) {
            log.info("Data exists. Skipping seeder.");
            return;
        }

        List<Hospital> hospitals = hospitalRepository.findAll();

        if (hospitals.isEmpty()) {
            log.info("No hospitals. Skipping seeder.");
            return;
        }

        // Realistic 7-day patterns
        // Different per hospital
        int[][] patterns = {
                {45, 52, 48, 61, 55, 67, 58},
                {23, 28, 31, 25, 35, 29, 33},
                {78, 82, 75, 88, 91, 85, 79},
                {12, 15, 11, 18, 14, 16, 13}
        };

        for (int h = 0; h < hospitals.size(); h++) {
            Hospital hospital = hospitals.get(h);
            int[] pattern = patterns[h % patterns.length];

            // Seed 7 days of data
            for (int i = 6; i >= 0; i--) {
                // day 6 = 6 days ago
                // day 0 = today
                LocalDate date = LocalDate.now().minusDays(i);
                int count = pattern[6 - i];

                PatientAdmission admission = PatientAdmission.builder()
                        .hospital(hospital)
                        .date(date)
                        .admissionCount(count)
                        .build();

                patientAdmissionRepository.save(admission);
            }

            log.info("Seeded 7-day admission data for hospital: {}", hospital.getHospitalName());
        }

        log.info("Data seeding complete!");
    }
}
