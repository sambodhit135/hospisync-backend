package hospital.Hospisync_backend.repository;

import hospital.Hospisync_backend.model.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, Long> {
    
    List<Doctor> findByHospitalId(Long hospitalId);
    
    List<Doctor> findByHospitalIdAndSpeciality(Long hospitalId, String speciality);
    
    List<Doctor> findByHospitalIdAndIsAvailableTrue(Long hospitalId);
    
    List<Doctor> findByHospitalIdAndSpecialityAndIsAvailableTrue(Long hospitalId, String speciality);
    
    Optional<Doctor> findByIdAndHospitalId(Long doctorId, Long hospitalId);
}
