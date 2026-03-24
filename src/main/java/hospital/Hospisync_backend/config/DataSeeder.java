package hospital.Hospisync_backend.config;

import hospital.Hospisync_backend.model.PatientAdmission;
import hospital.Hospisync_backend.repository.PatientAdmissionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
public class DataSeeder implements CommandLineRunner {

    @Autowired
    private PatientAdmissionRepository admissionRepo;

    @Autowired
    private hospital.Hospisync_backend.repository.HospitalRepository hospitalRepo;

    @Override
    public void run(String... args) {

        // Wipe old data so demo dates are always aligned with 'today'
        admissionRepo.deleteAll();
        
        System.out.println("Seeding fresh patient admission data for forecasting...");

        // Realistic admission numbers provided by user
        int[] admissions = {45, 52, 48, 61, 55, 67, 58};
        
        hospitalRepo.findAll().forEach(hospital -> {
            System.out.println("Seeding for hospital: " + hospital.getHospitalName());
            for (int i = 6; i >= 0; i--) {
                PatientAdmission record = new PatientAdmission();
                record.setHospital(hospital);
                record.setDate(java.time.LocalDate.now().minusDays(i));
                record.setAdmissionCount(admissions[6 - i]);
                admissionRepo.save(record);
            }
        });
        
        System.out.println("Seeding complete.");

        try {
            java.io.File file = new java.io.File("debug_hospitals.txt");
            java.io.FileWriter writer = new java.io.FileWriter(file);
            writer.write("Hospitals in DB:\n");
            hospitalRepo.findAll().forEach(h -> {
                try {
                    writer.write("ID: " + h.getId() + " Name: " + h.getHospitalName() + " Lat: " + h.getLatitude() + " Lon: " + h.getLongitude() + "\n");
                    // also print beds?
                } catch(Exception e) {}
            });
            writer.close();
            System.out.println("DEBUG HOSPITALS LOG WRITTEN TO " + file.getAbsolutePath());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
