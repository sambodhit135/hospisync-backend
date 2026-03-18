package hospital.Hospisync_backend.controller;

import hospital.Hospisync_backend.dto.BedCategoryRequest;
import hospital.Hospisync_backend.model.BedCategory;
import hospital.Hospisync_backend.service.BedCategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/bed-categories")
@RequiredArgsConstructor
public class BedCategoryController {

    private final BedCategoryService bedCategoryService;

    @GetMapping("/{hospitalId}")
    public ResponseEntity<?> getCategories(@PathVariable Long hospitalId) {
        try {
            List<BedCategory> categories = bedCategoryService.getCategories(hospitalId);
            if (categories == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Categories not found"));
            }
            return ResponseEntity.ok(categories);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "Failed to load categories: " + e.getMessage()));
        }
    }

    @GetMapping("/names")
    public ResponseEntity<List<String>> getCategoryNames() {
        return ResponseEntity.ok(bedCategoryService.getAllCategoryNames());
    }

    @PostMapping("/{hospitalId}")
    public ResponseEntity<?> addCategory(@PathVariable Long hospitalId,
                                         @RequestBody BedCategoryRequest request) {
        try {
            BedCategory category = bedCategoryService.addCategory(hospitalId, request);
            return ResponseEntity.ok(Map.of(
                    "message", "Bed category added successfully",
                    "categoryId", category.getCategoryId(),
                    "categoryName", category.getCategoryName()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{hospitalId}/{categoryId}")
    public ResponseEntity<?> updateCategory(@PathVariable Long hospitalId,
                                            @PathVariable Long categoryId,
                                            @RequestBody BedCategoryRequest request) {
        try {
            BedCategory category = bedCategoryService.updateCategory(hospitalId, categoryId, request);
            return ResponseEntity.ok(Map.of(
                    "message", "Bed category updated successfully",
                    "categoryId", category.getCategoryId(),
                    "categoryName", category.getCategoryName(),
                    "totalCapacity", category.getTotalCapacity(),
                    "occupiedBeds", category.getOccupiedBeds(),
                    "availableBeds", category.getAvailableBeds()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{hospitalId}/{categoryId}")
    public ResponseEntity<?> deleteCategory(@PathVariable Long hospitalId,
                                            @PathVariable Long categoryId) {
        try {
            bedCategoryService.deleteCategory(hospitalId, categoryId);
            return ResponseEntity.ok(Map.of("message", "Bed category deleted successfully"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
