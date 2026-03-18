package hospital.Hospisync_backend.service;

import hospital.Hospisync_backend.dto.BedCategoryRequest;
import hospital.Hospisync_backend.model.BedCategory;
import hospital.Hospisync_backend.model.Hospital;
import hospital.Hospisync_backend.repository.BedCategoryRepository;
import hospital.Hospisync_backend.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BedCategoryService {

    private final BedCategoryRepository bedCategoryRepository;
    private final HospitalRepository hospitalRepository;
    private final NotificationService notificationService;

    public List<BedCategory> getCategories(Long hospitalId) {
        return bedCategoryRepository.findByHospitalIdOrderByCategoryIdAsc(hospitalId);
    }

    @Transactional
    public BedCategory addCategory(Long hospitalId, BedCategoryRequest request) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));

        // Validation
        if (request.getCategoryName() == null || request.getCategoryName().trim().isEmpty()) {
            throw new IllegalArgumentException("Category name cannot be empty.");
        }
        if (request.getTotalCapacity() == null || request.getTotalCapacity() < 0) {
            throw new IllegalArgumentException("Total capacity must be a positive number.");
        }

        int occupied = request.getOccupiedBeds() != null ? request.getOccupiedBeds() : 0;
        if (occupied < 0) {
            throw new IllegalArgumentException("Occupied beds cannot be negative.");
        }
        if (occupied > request.getTotalCapacity()) {
            throw new IllegalArgumentException("Occupied beds cannot exceed total capacity.");
        }

        BedCategory category = BedCategory.builder()
                .hospital(hospital)
                .categoryName(request.getCategoryName().trim())
                .icon(request.getIcon() != null && !request.getIcon().isEmpty() ? request.getIcon() : "🛏️")
                .totalCapacity(request.getTotalCapacity())
                .occupiedBeds(occupied)
                .build();

        hospital.setLastUpdated(LocalDateTime.now());
        hospitalRepository.save(hospital);

        return bedCategoryRepository.save(category);
    }

    @Transactional
    public BedCategory updateCategory(Long hospitalId, Long categoryId, BedCategoryRequest request) {
        BedCategory category = bedCategoryRepository.findByCategoryIdAndHospitalId(categoryId, hospitalId)
                .orElseThrow(() -> new RuntimeException("Bed category not found"));

        // Validate name
        if (request.getCategoryName() != null && !request.getCategoryName().trim().isEmpty()) {
            category.setCategoryName(request.getCategoryName().trim());
        }

        // Validate icon
        if (request.getIcon() != null && !request.getIcon().isEmpty()) {
            category.setIcon(request.getIcon());
        }

        // Validate capacity
        if (request.getTotalCapacity() != null) {
            if (request.getTotalCapacity() < 0) {
                throw new IllegalArgumentException("Total capacity must be a positive number.");
            }
            int newOccupied = request.getOccupiedBeds() != null ? request.getOccupiedBeds() : category.getOccupiedBeds();
            if (newOccupied > request.getTotalCapacity()) {
                throw new IllegalArgumentException(
                        "Cannot reduce capacity to " + request.getTotalCapacity() +
                        ". Currently " + newOccupied + " beds are occupied.");
            }
            category.setTotalCapacity(request.getTotalCapacity());
        }

        // Validate occupied
        if (request.getOccupiedBeds() != null) {
            if (request.getOccupiedBeds() < 0) {
                throw new IllegalArgumentException("Occupied beds cannot be negative.");
            }
            if (request.getOccupiedBeds() > category.getTotalCapacity()) {
                throw new IllegalArgumentException(
                        "Occupied beds (" + request.getOccupiedBeds() +
                        ") cannot exceed capacity (" + category.getTotalCapacity() + ").");
            }
            category.setOccupiedBeds(request.getOccupiedBeds());
        }

        // Save category first so we can calculate the new total occupancy
        BedCategory savedCategory = bedCategoryRepository.save(category);

        // Update hospital timestamp
        Hospital hospital = savedCategory.getHospital();
        hospital.setLastUpdated(LocalDateTime.now());
        hospitalRepository.save(hospital);

        // Trigger Smart Alert if capacity > 90%
        double currentOccupancy = getOccupancyRate(hospitalId);
        if (currentOccupancy >= 90.0) {
            notificationService.createNotification(
                    hospital,
                    "⚠ Capacity Alert: Your hospital is currently operating at " + 
                    Math.round(currentOccupancy) + "% capacity. Consider transferring patients.",
                    "WARNING"
            );
        }

        return savedCategory;
    }

    @Transactional
    public void deleteCategory(Long hospitalId, Long categoryId) {
        BedCategory category = bedCategoryRepository.findByCategoryIdAndHospitalId(categoryId, hospitalId)
                .orElseThrow(() -> new RuntimeException("Bed category not found"));

        if (category.getOccupiedBeds() > 0) {
            throw new IllegalArgumentException(
                    "Cannot delete '" + category.getCategoryName() +
                    "' — " + category.getOccupiedBeds() + " beds are still occupied. Set occupied to 0 first.");
        }

        bedCategoryRepository.delete(category);

        // Update hospital timestamp
        Hospital hospital = category.getHospital();
        hospital.setLastUpdated(LocalDateTime.now());
        hospitalRepository.save(hospital);
    }


    // ===== Aggregate helpers for dashboard & recommendations =====

    public int getTotalBeds(Long hospitalId) {
        return getCategories(hospitalId).stream()
                .mapToInt(BedCategory::getTotalCapacity).sum();
    }

    public int getTotalOccupied(Long hospitalId) {
        return getCategories(hospitalId).stream()
                .mapToInt(BedCategory::getOccupiedBeds).sum();
    }

    public int getAvailableBeds(Long hospitalId) {
        return getCategories(hospitalId).stream()
                .mapToInt(BedCategory::getAvailableBeds).sum();
    }

    public double getOccupancyRate(Long hospitalId) {
        int total = getTotalBeds(hospitalId);
        if (total == 0) return 0;
        return (double) getTotalOccupied(hospitalId) / total * 100;
    }

    public int getAvailableBedsByCategory(Long hospitalId, String categoryKeyword) {
        String normalizedKeyword = normalizeSearchTerm(categoryKeyword);
        return getCategories(hospitalId).stream()
                .filter(c -> isMatch(c.getCategoryName(), normalizedKeyword))
                .mapToInt(BedCategory::getAvailableBeds)
                .sum();
    }

    public int getTotalPossibleBedsByCategory(Long hospitalId, String categoryKeyword) {
        String normalizedKeyword = normalizeSearchTerm(categoryKeyword);
        return getCategories(hospitalId).stream()
                .filter(c -> isMatch(c.getCategoryName(), normalizedKeyword))
                .mapToInt(c -> c.getAvailableBeds() + c.getFutureReservedBeds())
                .sum();
    }

    private String normalizeSearchTerm(String term) {
        if (term == null) return "";
        return term.toLowerCase().replace("beds", "").trim();
    }

    private boolean isMatch(String categoryName, String normalizedKeyword) {
        if (categoryName == null || normalizedKeyword.isEmpty()) return false;
        String normalizedName = categoryName.toLowerCase().replace("beds", "").trim();
        return normalizedName.equals(normalizedKeyword) || normalizedName.contains(normalizedKeyword);
    }

    public int getTotalPossibleBeds(Long hospitalId) {
        return getCategories(hospitalId).stream()
                .mapToInt(c -> c.getAvailableBeds() + c.getFutureReservedBeds())
                .sum();
    }

    public List<String> getAllCategoryNames() {
        return bedCategoryRepository.findAll().stream()
                .map(BedCategory::getCategoryName)
                .distinct()
                .sorted()
                .collect(java.util.stream.Collectors.toList());
    }

    @Transactional
    public void seedDefaults(Hospital hospital) {
        String[][] defaults = {
            {"ICU", "🏥"},
            {"Daycare", "🛌"},
            {"General", "🏬"},
            {"Child Care", "👶"},
            {"Essential", "🚑"},
            {"Oxygen Beds", "🧪"},
            {"Ventilator Beds", "💨"}
        };

        for (String[] def : defaults) {
            BedCategory category = BedCategory.builder()
                    .hospital(hospital)
                    .categoryName(def[0])
                    .icon(def[1])
                    .totalCapacity(0) // Default to 0 for setup wizard
                    .occupiedBeds(0)
                    .build();
            bedCategoryRepository.save(category);
        }
    }
}
